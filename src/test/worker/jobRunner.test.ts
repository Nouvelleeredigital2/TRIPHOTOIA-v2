import { describe, expect, it, vi } from 'vitest';
import {
  claimNextJob,
  processWorkerJob,
  WorkerJob,
} from '../../../worker/jobRunner';

const makeJob = (overrides: Partial<WorkerJob> = {}): WorkerJob => ({
  id: 'job-1',
  project_id: 'project-1',
  photo_id: 'photo-1',
  job_type: 'quality_analysis',
  status: 'pending',
  attempts: 0,
  payload: {},
  result: {},
  error_message: null,
  run_after: new Date().toISOString(),
  locked_at: null,
  locked_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('worker job runner', () => {
  it('claims the next job atomically via the claim_next_job RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: makeJob({
        status: 'processing',
        attempts: 1,
        locked_by: 'worker-a',
      }),
      error: null,
    });
    const client = { from: vi.fn(), rpc };

    const job = await claimNextJob(client, 'worker-a');

    expect(rpc).toHaveBeenCalledWith('claim_next_job', {
      p_worker_id: 'worker-a',
    });
    expect(job?.id).toBe('job-1');
    expect(job?.status).toBe('processing');
  });

  it('returns null when no job is available (RPC yields no row)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { from: vi.fn(), rpc };

    const job = await claimNextJob(client, 'worker-a');

    expect(job).toBeNull();
  });

  it('normalises an array response from the claim RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [makeJob({ status: 'processing' })],
      error: null,
    });
    const client = { from: vi.fn(), rpc };

    const job = await claimNextJob(client, 'worker-a');

    expect(job?.id).toBe('job-1');
  });

  it('completes a quality analysis job and writes photo analysis results', async () => {
    const jobsUpdate = vi.fn().mockReturnThis();
    const jobsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const analysisUpsert = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const photosUpdate = vi.fn().mockReturnThis();
    const photosEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'photo_analysis') return { upsert: analysisUpsert };
        if (table === 'photos') return { update: photosUpdate, eq: photosEq };
        return { update: jobsUpdate, eq: jobsEq };
      }),
    };

    await processWorkerJob(client, makeJob(), {
      quality_analysis: async () => ({
        result: {
          score: 82,
          sharpness_score: 76,
          composition_score: 88,
          is_blurry: false,
        },
        photoAnalysis: {
          score: 82,
          sharpness_score: 76,
          composition_score: 88,
          is_blurry: false,
          explanation: 'Image nette et bien composee.',
        },
        photoUpdate: { analysis_status: 'completed' },
      }),
    });

    expect(analysisUpsert).toHaveBeenCalledWith({
      photo_id: 'photo-1',
      score: 82,
      sharpness_score: 76,
      composition_score: 88,
      is_blurry: false,
      explanation: 'Image nette et bien composee.',
    });
    expect(photosUpdate).toHaveBeenCalledWith({ analysis_status: 'completed' });
    expect(photosEq).toHaveBeenCalledWith('id', 'photo-1');
    expect(jobsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        result: expect.objectContaining({ score: 82 }),
        error_message: null,
      })
    );
    expect(jobsEq).toHaveBeenCalledWith('id', 'job-1');
  });

  it('runs semantic_embedding and upserts a vector into photo_embeddings', async () => {
    const jobsUpdate = vi.fn().mockReturnThis();
    const jobsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const embeddingsUpsert = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'photo_embeddings') return { upsert: embeddingsUpsert };
        return { update: jobsUpdate, eq: jobsEq };
      }),
    };

    await processWorkerJob(
      client,
      makeJob({
        job_type: 'semantic_embedding',
        payload: {
          storage_path: 'organizations/o1/projects/p1/originals/photo-1.jpg',
        },
      })
    );

    expect(embeddingsUpsert).toHaveBeenCalledTimes(1);
    const upserted = embeddingsUpsert.mock.calls[0][0];
    expect(upserted.photo_id).toBe('photo-1');
    expect(upserted.model).toBe('deterministic-v1');
    expect(upserted.embedding).toHaveLength(512);
    expect(jobsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('runs face_detection and inserts anonymous faces into photo_faces', async () => {
    const jobsUpdate = vi.fn().mockReturnThis();
    const jobsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const facesInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'photo_faces') return { insert: facesInsert };
        return { update: jobsUpdate, eq: jobsEq };
      }),
    };

    await processWorkerJob(
      client,
      makeJob({
        job_type: 'face_detection',
        payload: {
          storage_path: 'organizations/o1/projects/p1/originals/photo-1.jpg',
        },
      })
    );

    expect(facesInsert).toHaveBeenCalledTimes(1);
    const rows = facesInsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    rows.forEach((row) => {
      expect(row.photo_id).toBe('photo-1');
      expect(row.embedding).toHaveLength(128);
      // Faces are anonymous on insert — never auto-assigned to a person.
      expect(row).not.toHaveProperty('person_id');
    });
    expect(jobsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('marks a failed job with an error message', async () => {
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      from: vi.fn().mockReturnValue({ update, eq }),
    };

    await expect(
      processWorkerJob(client, makeJob(), {
        quality_analysis: async () => {
          throw new Error('decode failed');
        },
      })
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'decode failed',
      })
    );
    expect(eq).toHaveBeenCalledWith('id', 'job-1');
  });
});
