import { describe, it, expect, vi } from 'vitest';
import {
  parseSmokeConfig,
  runCloudSmoke,
  type SmokeClient,
  type SmokeConfig,
} from '../../../../scripts/cloud-smoke';

const baseConfig = (overrides: Partial<SmokeConfig> = {}): SmokeConfig => ({
  url: 'https://smoke.supabase.co',
  key: 'service-role',
  bucket: 'project-photos',
  confirmed: true,
  ...overrides,
});

interface FakeOptions {
  bucketError?: string;
  insertErrorFor?: string;
  deleteUserError?: string;
  deleteOrgError?: string;
}

const createFakeClient = (opts: FakeOptions = {}) => {
  const calls: string[] = [];
  let idCounter = 0;
  const nextId = () => `id-${(idCounter += 1)}`;

  const client: SmokeClient = {
    auth: {
      admin: {
        createUser: (attrs) => {
          calls.push('auth.createUser');
          void attrs;
          return Promise.resolve({ data: { user: { id: 'user-1' } }, error: null });
        },
        deleteUser: (id) => {
          calls.push(`auth.deleteUser:${id}`);
          return Promise.resolve({
            error: opts.deleteUserError ? { message: opts.deleteUserError } : null,
          });
        },
      },
    },
    storage: {
      getBucket: (id) => {
        calls.push(`storage.getBucket:${id}`);
        return Promise.resolve({
          data: opts.bucketError ? null : { name: id },
          error: opts.bucketError ? { message: opts.bucketError } : null,
        });
      },
    },
    from: (table) => ({
      insert: (payload) => {
        calls.push(`insert:${table}`);
        void payload;
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                opts.insertErrorFor === table
                  ? { data: null, error: { message: `boom ${table}` } }
                  : { data: { id: nextId() }, error: null },
              ),
          }),
        };
      },
      update: (payload) => {
        calls.push(`update:${table}`);
        void payload;
        return { eq: () => Promise.resolve({ error: null }) };
      },
      delete: () => ({
        eq: (column: string, value: string) => {
          calls.push(`delete:${table}:${column}=${value}`);
          return Promise.resolve({
            error: opts.deleteOrgError ? { message: opts.deleteOrgError } : null,
          });
        },
      }),
    }),
  };

  return { client, calls };
};

describe('parseSmokeConfig', () => {
  it('throws fast when required secrets are missing', () => {
    expect(() => parseSmokeConfig({})).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => parseSmokeConfig({ SUPABASE_URL: 'x' })).toThrow();
  });

  it('defaults the bucket and reads the confirm flag', () => {
    const cfg = parseSmokeConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    expect(cfg.bucket).toBe('project-photos');
    expect(cfg.confirmed).toBe(false);

    const confirmed = parseSmokeConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      TREEPHOTO_SMOKE_CONFIRM: '1',
      PROJECT_PHOTOS_BUCKET: 'custom-bucket',
    });
    expect(confirmed.bucket).toBe('custom-bucket');
    expect(confirmed.confirmed).toBe(true);
  });
});

describe('runCloudSmoke', () => {
  it('does nothing against the client in dry-run mode', async () => {
    const { client, calls } = createFakeClient();
    const result = await runCloudSmoke({
      config: baseConfig({ confirmed: false }),
      client,
      nonce: 'n1',
    });

    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it('runs the full insert/update/cleanup sequence when confirmed', async () => {
    const { client, calls } = createFakeClient();
    const result = await runCloudSmoke({ config: baseConfig(), client, nonce: 'n2' });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(calls).toEqual([
      'storage.getBucket:project-photos',
      'auth.createUser',
      'insert:organizations',
      'insert:projects',
      'insert:photos',
      'insert:jobs',
      'update:photos',
      // Cleanup: org deleted FIRST (cascade), then the user can be removed.
      'delete:organizations:id=id-1',
      'auth.deleteUser:user-1',
    ]);
  });

  it('fails fast when the bucket is missing', async () => {
    const { client, calls } = createFakeClient({ bucketError: 'not found' });
    await expect(
      runCloudSmoke({ config: baseConfig(), client, nonce: 'n3' }),
    ).rejects.toThrow(/bucket .* failed/);
    // No user was created, so no cleanup needed.
    expect(calls).not.toContain('auth.deleteUser:user-1');
  });

  it('still deletes the temp user when a later step fails', async () => {
    const { client, calls } = createFakeClient({ insertErrorFor: 'projects' });
    await expect(
      runCloudSmoke({ config: baseConfig(), client, nonce: 'n4' }),
    ).rejects.toThrow(/insert project failed/);
    // Cleanup must run despite the failure (finally block): org first, then user.
    expect(calls).toContain('delete:organizations:id=id-1');
    expect(calls).toContain('auth.deleteUser:user-1');
  });

  it('warns but does not throw when cleanup fails', async () => {
    const { client } = createFakeClient({ deleteUserError: 'cannot delete' });
    const log = vi.fn();
    const result = await runCloudSmoke({ config: baseConfig(), client, nonce: 'n5', log });

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cleanup of temp user failed'));
  });
});
