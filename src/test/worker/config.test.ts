import { describe, expect, it } from 'vitest';
import { createWorkerConfig } from '../../../worker/config';

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
});
