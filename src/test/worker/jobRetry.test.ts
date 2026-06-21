import { describe, it, expect, vi } from 'vitest';
import { markJobFailed, reclaimStuckJobs } from '../../../worker/jobRunner';

// P1-E : retry/backoff + dead-letter via RPC, et récupération des locks expirés.

describe('markJobFailed (P1-E)', () => {
  it('délègue à fail_or_retry_job quand le client expose rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'pending', error: null });
    const client = { rpc } as never;

    await markJobFailed(client, 'job-1', 'boom');

    expect(rpc).toHaveBeenCalledWith('fail_or_retry_job', {
      p_job_id: 'job-1',
      p_error: 'boom',
    });
  });

  it('repli en échec terminal quand le client n’a pas de rpc', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const client = { from: vi.fn(() => ({ update })) } as never;

    await markJobFailed(client, 'job-1', 'boom');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_message: 'boom' })
    );
    expect(eq).toHaveBeenCalledWith('id', 'job-1');
  });

  it('propage une erreur RPC', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('rpc down') });
    await expect(
      markJobFailed({ rpc } as never, 'job-1', 'boom')
    ).rejects.toThrow('rpc down');
  });
});

describe('reclaimStuckJobs (P1-E)', () => {
  it('appelle reclaim_stuck_jobs et renvoie le nombre récupéré', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const count = await reclaimStuckJobs({ rpc } as never, 300);

    expect(rpc).toHaveBeenCalledWith('reclaim_stuck_jobs', {
      p_lease_seconds: 300,
    });
    expect(count).toBe(3);
  });

  it('renvoie 0 si la RPC ne renvoie pas un nombre', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await reclaimStuckJobs({ rpc } as never)).toBe(0);
  });
});
