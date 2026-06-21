import { describe, it, expect, vi } from 'vitest';
import { runWorkerSmoke, type WorkerSmokeClient } from '../../../scripts/worker-smoke';
import type { SmokeConfig } from '../../../scripts/cloud-smoke';

const baseConfig = (overrides: Partial<SmokeConfig> = {}): SmokeConfig => ({
  url: 'https://smoke.supabase.co',
  key: 'service-role',
  bucket: 'project-photos',
  confirmed: true,
  ...overrides,
});

interface FakeOptions {
  jobRows?: { id: string; status: string; error_message: string | null }[];
}

const createFakeClient = (opts: FakeOptions = {}) => {
  const calls: string[] = [];
  let idCounter = 0;
  const nextId = () => `id-${(idCounter += 1)}`;
  const jobRows =
    opts.jobRows ??
    [
      { id: 'j1', status: 'completed', error_message: null },
      { id: 'j2', status: 'completed', error_message: null },
      { id: 'j3', status: 'completed', error_message: null },
    ];

  const client = {
    auth: {
      admin: {
        createUser: () => {
          calls.push('auth.createUser');
          return Promise.resolve({ data: { user: { id: 'user-1' } }, error: null });
        },
        deleteUser: (id: string) => {
          calls.push(`auth.deleteUser:${id}`);
          return Promise.resolve({ error: null });
        },
      },
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: (table: string) => ({
      insert: (payload: unknown) => {
        calls.push(`insert:${table}`);
        void payload;
        const thenable = {
          select: () => ({
            single: () => Promise.resolve({ data: { id: nextId() }, error: null }),
          }),
          then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
        };
        return thenable as never;
      },
      select: () => ({
        eq: (column: string, value: string) => {
          calls.push(`select:${table}:${column}=${value}`);
          return Promise.resolve({ data: jobRows, error: null });
        },
      }),
    }),
  } as unknown as WorkerSmokeClient;

  return { client, calls };
};

describe('runWorkerSmoke', () => {
  it('is a no-op against the client in dry-run mode', async () => {
    const { client, calls } = createFakeClient();
    const result = await runWorkerSmoke({
      config: baseConfig({ confirmed: false }),
      client,
      nonce: 'n1',
      runOnce: vi.fn(),
    });

    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it('seeds 3 jobs, drains them, verifies terminal state, and cleans up', async () => {
    const { client, calls } = createFakeClient();
    // runOnce returns true 3 times (one per job) then false.
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    const result = await runWorkerSmoke({ config: baseConfig(), client, nonce: 'n2', runOnce });

    expect(result.ok).toBe(true);
    expect(runOnce).toHaveBeenCalledTimes(4); // 3 jobs + 1 terminating false
    // Three job inserts happened.
    expect(calls.filter((c) => c === 'insert:jobs')).toHaveLength(3);
    // Verification queried jobs by project, and cleanup ran.
    expect(calls.some((c) => c.startsWith('select:jobs:project_id='))).toBe(true);
    expect(calls).toContain('auth.deleteUser:user-1');
  });

  it('accepts failed jobs as long as they carry an error_message', async () => {
    const { client } = createFakeClient({
      jobRows: [
        { id: 'j1', status: 'completed', error_message: null },
        { id: 'j2', status: 'failed', error_message: 'decode failed' },
      ],
    });
    const result = await runWorkerSmoke({
      config: baseConfig(),
      client,
      nonce: 'n3',
      runOnce: vi.fn().mockResolvedValue(false),
    });
    expect(result.ok).toBe(true);
  });

  it('throws when a job is left in a non-terminal (stuck) state', async () => {
    const { client } = createFakeClient({
      jobRows: [{ id: 'j1', status: 'processing', error_message: null }],
    });
    await expect(
      runWorkerSmoke({
        config: baseConfig(),
        client,
        nonce: 'n4',
        runOnce: vi.fn().mockResolvedValue(false),
      }),
    ).rejects.toThrow(/non-terminal state/);
  });

  it('throws when a failed job has no error_message', async () => {
    const { client } = createFakeClient({
      jobRows: [{ id: 'j1', status: 'failed', error_message: null }],
    });
    await expect(
      runWorkerSmoke({
        config: baseConfig(),
        client,
        nonce: 'n5',
        runOnce: vi.fn().mockResolvedValue(false),
      }),
    ).rejects.toThrow(/without an error_message/);
  });
});
