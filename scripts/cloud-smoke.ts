// Supabase cloud smoke check.
//
// Verifies a real staging project end-to-end: DB connection, the private
// `project-photos` bucket, then a full org -> project -> photo -> job insert,
// a decision update, and a complete cleanup. Designed to be injectable so the
// orchestration is unit-tested without a live Supabase (mirrors the worker).
//
// Usage (staging only):
//   TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:cloud
// Without TREEPHOTO_SMOKE_CONFIRM=1 it prints the plan and exits 0 (dry-run).

export interface SmokeEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TREEPHOTO_SMOKE_CONFIRM?: string;
  PROJECT_PHOTOS_BUCKET?: string;
}

export interface SmokeConfig {
  url: string;
  key: string;
  bucket: string;
  confirmed: boolean;
}

type SupabaseError = { message?: string } | null;

interface InsertBuilder {
  select: (columns: string) => {
    single: () => PromiseLike<{
      data: { id: string } | null;
      error: SupabaseError;
    }>;
  };
}
interface MutateBuilder {
  eq: (column: string, value: string) => PromiseLike<{ error: SupabaseError }>;
}

export interface SmokeClient {
  auth: {
    admin: {
      createUser: (attrs: Record<string, unknown>) => PromiseLike<{
        data: { user: { id: string } | null };
        error: SupabaseError;
      }>;
      deleteUser: (id: string) => PromiseLike<{ error: SupabaseError }>;
    };
  };
  storage: {
    getBucket: (
      id: string
    ) => PromiseLike<{ data: unknown; error: SupabaseError }>;
  };
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => InsertBuilder;
    update: (payload: Record<string, unknown>) => MutateBuilder;
    delete: () => MutateBuilder;
  };
}

export interface SmokeResult {
  ok: boolean;
  dryRun: boolean;
  steps: string[];
}

const PLAN = [
  'check database connection (bucket lookup)',
  'verify private bucket exists',
  'create a temporary auth user',
  'insert smoke organization / project / photo / job',
  'update the smoke photo decision (pick)',
  'delete the temporary user (cascades smoke rows)',
];

/** Parse + validate env. Throws (fail fast) when required secrets are missing. */
export function parseSmokeConfig(env: SmokeEnv): SmokeConfig {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      'cloud smoke: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }
  return {
    url,
    key,
    bucket: env.PROJECT_PHOTOS_BUCKET?.trim() || 'project-photos',
    confirmed: env.TREEPHOTO_SMOKE_CONFIRM === '1',
  };
}

const fail = (label: string, error: SupabaseError): never => {
  throw new Error(
    `cloud smoke: ${label} failed — ${error?.message ?? 'unknown error'}`
  );
};

export interface RunCloudSmokeDeps {
  config: SmokeConfig;
  client: SmokeClient;
  log?: (message: string) => void;
  /** Distinct suffix for smoke rows so concurrent runs never collide. */
  nonce: string;
}

/**
 * Runs the smoke sequence. In dry-run mode (config.confirmed === false) it logs
 * the plan and returns without touching the client. The temporary user is always
 * cleaned up, even when a step throws.
 */
export async function runCloudSmoke({
  config,
  client,
  log = () => {},
  nonce,
}: RunCloudSmokeDeps): Promise<SmokeResult> {
  const steps: string[] = [];
  const record = (s: string) => {
    steps.push(s);
    log(s);
  };

  if (!config.confirmed) {
    log(
      'cloud smoke: DRY RUN (set TREEPHOTO_SMOKE_CONFIRM=1 to execute). Plan:'
    );
    PLAN.forEach((p) => log(`  - ${p}`));
    return { ok: true, dryRun: true, steps: PLAN };
  }

  let userId: string | null = null;
  let orgId: string | null = null;
  try {
    const conn = await client.storage.getBucket(config.bucket);
    if (conn.error) fail(`bucket "${config.bucket}" lookup`, conn.error);
    record(`bucket "${config.bucket}" present`);

    const created = await client.auth.admin.createUser({
      email: `smoke+${nonce}@treephoto.invalid`,
      password: `Smoke-${nonce}-pw`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      fail('create temp user', created.error);
    userId = created.data.user!.id;
    record('temp user created');

    const org = await client
      .from('organizations')
      .insert({ name: `smoke-org-${nonce}`, owner_id: userId })
      .select('id')
      .single();
    if (org.error || !org.data) fail('insert organization', org.error);
    orgId = org.data!.id;
    record('organization inserted');

    const project = await client
      .from('projects')
      .insert({
        organization_id: org.data!.id,
        name: `smoke-project-${nonce}`,
        created_by: userId,
      })
      .select('id')
      .single();
    if (project.error || !project.data) fail('insert project', project.error);
    record('project inserted');

    const photo = await client
      .from('photos')
      .insert({
        project_id: project.data!.id,
        original_filename: `smoke-${nonce}.jpg`,
        storage_path: `smoke/${nonce}.jpg`,
      })
      .select('id')
      .single();
    if (photo.error || !photo.data) fail('insert photo', photo.error);
    record('photo inserted');

    const job = await client
      .from('jobs')
      .insert({
        project_id: project.data!.id,
        photo_id: photo.data!.id,
        job_type: 'quality_analysis',
      })
      .select('id')
      .single();
    if (job.error || !job.data) fail('insert job', job.error);
    record('job inserted');

    const decision = await client
      .from('photos')
      .update({ pick_status: 'pick', autoflow_class: 'keep' })
      .eq('id', photo.data!.id);
    if (decision.error) fail('update photo decision', decision.error);
    record('photo decision updated');

    return { ok: true, dryRun: false, steps };
  } finally {
    // Delete the org FIRST: projects.created_by references auth.users without
    // ON DELETE CASCADE, so deleting the user while a project exists fails.
    // Removing the org cascades project/photo/job, freeing the user for deletion.
    if (orgId) {
      const removedOrg = await client
        .from('organizations')
        .delete()
        .eq('id', orgId);
      if (removedOrg.error) {
        log(
          `cloud smoke: WARNING cleanup of smoke org failed — ${removedOrg.error.message ?? 'unknown'}`
        );
      } else {
        record('smoke org + cascaded rows deleted');
      }
    }
    if (userId) {
      const removed = await client.auth.admin.deleteUser(userId);
      if (removed.error) {
        log(
          `cloud smoke: WARNING cleanup of temp user failed — ${removed.error.message ?? 'unknown'}`
        );
      } else {
        record('temp user deleted');
      }
    }
  }
}

// CLI entry — only runs when executed directly, never on import (tests stay pure).
const invokedDirectly = Boolean(process.argv[1]?.includes('cloud-smoke'));

if (invokedDirectly) {
  (async () => {
    const config = parseSmokeConfig(process.env as SmokeEnv);
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as SmokeClient;
    const nonce = `${process.pid}-${process.hrtime.bigint().toString(36)}`;
    const result = await runCloudSmoke({
      config,
      client,
      log: (m) => console.log(m),
      nonce,
    });
    console.log(result.dryRun ? 'cloud smoke: dry-run ok' : 'cloud smoke: ok');
  })().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
