export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  workerId: string;
  pollIntervalMs: number;
}

type WorkerEnv = Record<string, string | undefined>;

export function createWorkerConfig(env: WorkerEnv): WorkerConfig {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    (key) => !env[key]?.trim()
  );
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
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
        ? pollIntervalMs
        : 5000,
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
  const environment = (env.WORKER_ENV ?? env.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();
  if (environment !== 'production') return;

  const allowSimulated =
    (env.ALLOW_SIMULATED_PROVIDERS ?? '').trim().toLowerCase() === 'true';
  if (allowSimulated) return;

  const embedding = (env.EMBEDDING_PROVIDER ?? 'deterministic')
    .trim()
    .toLowerCase();
  const face = (env.FACE_PROVIDER ?? 'deterministic').trim().toLowerCase();
  // P0-5 : les processeurs image (miniature/qualité/hash) sont par défaut des
  // stubs (chemin sans vraie miniature, score par défaut, hash dérivé du nom).
  // Ils ne doivent pas compléter de jobs en production : seul un vrai moteur
  // pixel (IMAGE_PROCESSOR=sharp, non encore câblé) est autorisé en prod.
  const imageProcessor = (env.IMAGE_PROCESSOR ?? 'stub').trim().toLowerCase();

  const simulated: string[] = [];
  if (embedding === 'deterministic')
    simulated.push('EMBEDDING_PROVIDER=deterministic');
  if (face === 'deterministic') simulated.push('FACE_PROVIDER=deterministic');
  if (imageProcessor === 'stub')
    simulated.push('IMAGE_PROCESSOR=stub (miniature/qualité/hash simulés)');

  if (simulated.length > 0) {
    throw new Error(
      `Traitements simulés interdits en production : ${simulated.join(', ')}. ` +
        'Configure des moteurs réels (EMBEDDING_PROVIDER=clip, FACE_PROVIDER=onnx, ' +
        'IMAGE_PROCESSOR=sharp) ou, en recette uniquement, ALLOW_SIMULATED_PROVIDERS=true.'
    );
  }
}
