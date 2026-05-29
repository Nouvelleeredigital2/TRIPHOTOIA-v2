export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  workerId: string;
  pollIntervalMs: number;
}

type WorkerEnv = Record<string, string | undefined>;

export function createWorkerConfig(env: WorkerEnv): WorkerConfig {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} required for the TreePhoto worker`);
  }

  const supabaseUrl = env.SUPABASE_URL!.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const pollIntervalMs = Number(env.WORKER_POLL_INTERVAL_MS ?? 5000);

  return {
    supabaseUrl,
    serviceRoleKey,
    workerId: env.WORKER_ID?.trim() || `treephoto-worker-${process.pid}`,
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : 5000,
  };
}
