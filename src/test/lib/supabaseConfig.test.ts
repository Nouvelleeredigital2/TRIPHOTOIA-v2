import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from '../../lib/supabaseConfig';

describe('readSupabaseConfig', () => {
  it('keeps Supabase disabled when URL or anon key is missing', () => {
    expect(readSupabaseConfig({})).toEqual({ enabled: false });
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://demo.supabase.co' })).toEqual({ enabled: false });
    expect(readSupabaseConfig({ VITE_SUPABASE_ANON_KEY: 'anon-key' })).toEqual({ enabled: false });
  });

  it('enables Supabase only with URL and anon key', () => {
    expect(readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://demo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    })).toEqual({
      enabled: true,
      url: 'https://demo.supabase.co',
      anonKey: 'anon-key',
    });
  });

  it('rejects service role keys in frontend environment variables', () => {
    expect(() => readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://demo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    })).toThrow(/service role/i);
  });
});
