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

/**
 * P0-4 : garde-fou production contre les fournisseurs IA simulés.
 *
 * Les providers `deterministic` produisent des résultats structurellement
 * valides mais sémantiquement faux (scores fixes, faux visages, embeddings
 * dérivés du chemin). Acceptable en dev/CI, JAMAIS en production : un job
 * `completed` laisserait croire à une vraie analyse.
 *
 * En production (WORKER_ENV=production ou NODE_ENV=production), on refuse de
 * démarrer si un provider est `deterministic`, sauf opt-out explicite
 * (ALLOW_SIMULATED_PROVIDERS=true) réservé aux environnements de recette.
 */
export function assertProvidersAllowed(env: WorkerEnv): void {
  const environment = (env.WORKER_ENV ?? env.NODE_ENV ?? 'development').trim().toLowerCase();
  if (environment !== 'production') return;

  const allowSimulated = (env.ALLOW_SIMULATED_PROVIDERS ?? '').trim().toLowerCase() === 'true';
  if (allowSimulated) return;

  const embedding = (env.EMBEDDING_PROVIDER ?? 'deterministic').trim().toLowerCase();
  const face = (env.FACE_PROVIDER ?? 'deterministic').trim().toLowerCase();

  const simulated: string[] = [];
  if (embedding === 'deterministic') simulated.push('EMBEDDING_PROVIDER=deterministic');
  if (face === 'deterministic') simulated.push('FACE_PROVIDER=deterministic');

  if (simulated.length > 0) {
    throw new Error(
      `Providers simulés interdits en production : ${simulated.join(', ')}. ` +
        'Configure des providers réels (EMBEDDING_PROVIDER=clip, FACE_PROVIDER=onnx) ' +
        'ou, en recette uniquement, ALLOW_SIMULATED_PROVIDERS=true.',
    );
  }
}
