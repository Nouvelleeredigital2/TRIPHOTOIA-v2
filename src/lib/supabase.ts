import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabaseConfig';

const supabaseConfig = readSupabaseConfig(import.meta.env);

/**
 * Client Supabase — null si les variables d'environnement ne sont pas configurées.
 * L'application fonctionne intégralement en mode local sans Supabase.
 */
export const supabase: SupabaseClient | null =
  supabaseConfig.enabled
    ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseConfigured = !!supabase;
