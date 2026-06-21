import { describe, expect, it } from 'vitest';
import {
  assertProvidersAllowed,
  createWorkerConfig,
} from '../../../worker/config';

describe('worker config', () => {
  it('requires Supabase URL and service role key', () => {
    expect(() => createWorkerConfig({})).toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('uses only worker-side service role configuration', () => {
    const config = createWorkerConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      WORKER_ID: 'worker-a',
      WORKER_POLL_INTERVAL_MS: '2500',
    });

    expect(config).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'service-role-key',
      workerId: 'worker-a',
      pollIntervalMs: 2500,
    });
  });

  describe('assertProvidersAllowed (P0-4)', () => {
    it('allows simulated providers outside production', () => {
      expect(() =>
        assertProvidersAllowed({ EMBEDDING_PROVIDER: 'deterministic' })
      ).not.toThrow();
      expect(() =>
        assertProvidersAllowed({
          WORKER_ENV: 'development',
          FACE_PROVIDER: 'deterministic',
        })
      ).not.toThrow();
    });

    it('rejects deterministic providers in production', () => {
      expect(() =>
        assertProvidersAllowed({
          WORKER_ENV: 'production',
          EMBEDDING_PROVIDER: 'deterministic',
        })
      ).toThrow(/simulés interdits en production/);
      expect(() =>
        assertProvidersAllowed({
          NODE_ENV: 'production',
          FACE_PROVIDER: 'deterministic',
        })
      ).toThrow(/simulés interdits en production/);
    });

    it('allows real providers in production', () => {
      expect(() =>
        assertProvidersAllowed({
          WORKER_ENV: 'production',
          EMBEDDING_PROVIDER: 'clip',
          FACE_PROVIDER: 'onnx',
        })
      ).not.toThrow();
    });

    it('allows a disabled face provider in production (off is not simulated)', () => {
      expect(() =>
        assertProvidersAllowed({
          WORKER_ENV: 'production',
          EMBEDDING_PROVIDER: 'clip',
          FACE_PROVIDER: 'disabled',
        })
      ).not.toThrow();
    });

    it('honours the ALLOW_SIMULATED_PROVIDERS escape hatch', () => {
      expect(() =>
        assertProvidersAllowed({
          WORKER_ENV: 'production',
          EMBEDDING_PROVIDER: 'deterministic',
          ALLOW_SIMULATED_PROVIDERS: 'true',
        })
      ).not.toThrow();
    });
  });
});
