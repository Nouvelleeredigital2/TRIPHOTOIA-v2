export interface SupabaseConfigDisabled {
  enabled: false;
}

export interface SupabaseConfigEnabled {
  enabled: true;
  url: string;
  anonKey: string;
}

export type SupabaseConfig = SupabaseConfigDisabled | SupabaseConfigEnabled;

type SupabaseEnv = Record<string, string | undefined>;

export function readSupabaseConfig(env: SupabaseEnv): SupabaseConfig {
  if (env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role key must never be exposed in frontend environment variables.');
  }

  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return { enabled: false };
  }

  return {
    enabled: true,
    url,
    anonKey,
  };
}
