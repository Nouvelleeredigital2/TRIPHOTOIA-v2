// Worker end-to-end smoke check.
//
// Seeds a smoke photo + the three core pending jobs (generate_thumbnail,
// quality_analysis, perceptual_hash), drains them through the real job runner,
// then asserts each job is `completed` — or `failed` WITH an error_message
// (never left stuck in `processing`). Cleans up via the temporary user cascade.
//
// Injectable (client + runOnce) so the orchestration is unit-tested without a
// live Supabase. Usage (staging only):
//   TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker

import { parseSmokeConfig, type SmokeConfig } from './cloud-smoke';
import { runWorkerOnce } from '../worker/index';
import type { RpcCapableClient } from '../worker/jobRunner';

export { parseSmokeConfig };

type SupabaseError = { message?: string } | null;

const SMOKE_JOB_TYPES = ['generate_thumbnail', 'quality_analysis', 'perceptual_hash'] as const;

interface JobRow {
  id: string;
  status: string;
  error_message: string | null;
}

interface SingleBuilder {
  select: (columns: string) => { single: () => PromiseLike<{ data: { id: string } | null; error: SupabaseError }> };
}
interface SelectEqBuilder {
  select: (columns: string) => { eq: (column: string, value: string) => PromiseLike<{ data: JobRow[] | null; error: SupabaseError }> };
}

export interface WorkerSmokeClient extends RpcCapableClient {
  auth: {
    admin: {
      createUser: (attrs: Record<string, unknown>) => PromiseLike<{
        data: { user: { id: string } | null };
        error: SupabaseError;
      }>;
      deleteUser: (id: string) => PromiseLike<{ error: SupabaseError }>;
    };
  };
  from: (table: string) => {
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => SingleBuilder & PromiseLike<{ error: SupabaseError }>;
    select: SelectEqBuilder['select'];
  };
}

export interface WorkerSmokeResult {
  ok: boolean;
  dryRun: boolean;
  jobs: JobRow[];
  steps: string[];
}

const PLAN = [
  'create a temporary auth user + smoke project/photo',
  'insert pending jobs: generate_thumbnail, quality_analysis, perceptual_hash',
  'drain jobs through the worker job runner',
  'assert every job is completed (or failed with an error_message)',
  'delete the temporary user (cascades smoke rows)',
];

const fail = (label: string, error: SupabaseError): never => {
  throw new Error(`worker smoke: ${label} failed — ${error?.message ?? 'unknown error'}`);
};

export interface RunWorkerSmokeDeps {
  config: SmokeConfig;
  client: WorkerSmokeClient;
  nonce: string;
  /** Injectable for tests; defaults to the real worker runner. */
  runOnce?: (client: RpcCapableClient, workerId: string) => Promise<boolean>;
  log?: (message: string) => void;
  /** Safety cap on drain iterations. */
  maxDrain?: number;
}

export async function runWorkerSmoke({
  config,
  client,
  nonce,
  runOnce = runWorkerOnce,
  log = () => {},
  maxDrain = 20,
}: RunWorkerSmokeDeps): Promise<WorkerSmokeResult> {
  const steps: string[] = [];
  const record = (s: string) => {
    steps.push(s);
    log(s);
  };

  if (!config.confirmed) {
    log('worker smoke: DRY RUN (set TREEPHOTO_SMOKE_CONFIRM=1 to execute). Plan:');
    PLAN.forEach((p) => log(`  - ${p}`));
    return { ok: true, dryRun: true, jobs: [], steps: PLAN };
  }

  let userId: string | null = null;
  try {
    const created = await client.auth.admin.createUser({
      email: `worker-smoke+${nonce}@treephoto.invalid`,
      password: `Smoke-${nonce}-pw`,
      email_confirm: true,
    });
    if (created.error || !created.data.user) fail('create temp user', created.error);
    userId = created.data.user!.id;
    record('temp user created');

    const org = await client
      .from('organizations')
      .insert({ name: `worker-smoke-org-${nonce}`, owner_id: userId })
      .select('id')
      .single();
    if (org.error || !org.data) fail('insert organization', org.error);

    const project = await client
      .from('projects')
      .insert({ organization_id: org.data!.id, name: `worker-smoke-${nonce}`, created_by: userId })
      .select('id')
      .single();
    if (project.error || !project.data) fail('insert project', project.error);
    const projectId = project.data!.id;

    const photo = await client
      .from('photos')
      .insert({
        project_id: projectId,
        original_filename: `worker-smoke-${nonce}.jpg`,
        storage_path: `worker-smoke/${nonce}.jpg`,
      })
      .select('id')
      .single();
    if (photo.error || !photo.data) fail('insert photo', photo.error);
    record('project + photo inserted');

    for (const jobType of SMOKE_JOB_TYPES) {
      const inserted = await client.from('jobs').insert({
        project_id: projectId,
        photo_id: photo.data!.id,
        job_type: jobType,
        payload: { storage_path: `worker-smoke/${nonce}.jpg` },
      });
      if (inserted.error) fail(`insert ${jobType} job`, inserted.error);
    }
    record(`${SMOKE_JOB_TYPES.length} pending jobs inserted`);

    let drained = 0;
    while (drained < maxDrain) {
      const did = await runOnce(client, `worker-smoke-${nonce}`);
      if (!did) break;
      drained += 1;
    }
    record(`drained ${drained} job(s) through the runner`);

    const verify = await client
      .from('jobs')
      .select('id, status, error_message')
      .eq('project_id', projectId);
    if (verify.error || !verify.data) fail('verify jobs', verify.error);
    const jobs = verify.data!;

    const stuck = jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed');
    if (stuck.length > 0) {
      throw new Error(`worker smoke: ${stuck.length} job(s) left in a non-terminal state`);
    }
    const failedWithoutMessage = jobs.filter((j) => j.status === 'failed' && !j.error_message);
    if (failedWithoutMessage.length > 0) {
      throw new Error(`worker smoke: ${failedWithoutMessage.length} failed job(s) without an error_message`);
    }
    record('all jobs reached a terminal state with diagnostics');

    return { ok: true, dryRun: false, jobs, steps };
  } finally {
    if (userId) {
      const removed = await client.auth.admin.deleteUser(userId);
      if (removed.error) {
        log(`worker smoke: WARNING cleanup of temp user failed — ${removed.error.message ?? 'unknown'}`);
      } else {
        record('temp user + cascaded smoke rows deleted');
      }
    }
  }
}

// CLI entry — only runs when executed directly, never on import (tests stay pure).
const invokedDirectly = Boolean(process.argv[1]?.includes('worker-smoke'));

if (invokedDirectly) {
  (async () => {
    const config = parseSmokeConfig(process.env);
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as WorkerSmokeClient;
    const nonce = `${process.pid}-${process.hrtime.bigint().toString(36)}`;
    const result = await runWorkerSmoke({ config, client, nonce, log: (m) => console.log(m) });
    console.log(result.dryRun ? 'worker smoke: dry-run ok' : 'worker smoke: ok');
  })().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
