import { describe, expect, it, vi } from 'vitest';
import {
  buildProjectPhotoStoragePath,
  uploadPhotosToCloud,
} from '../../../features/cloud-projects/cloudUpload';

function createFile(name: string) {
  return new File(['image-data'], name, { type: 'image/jpeg' });
}

describe('cloud upload helpers', () => {
  it('builds a safe private storage path for project originals', () => {
    expect(
      buildProjectPhotoStoragePath({
        organizationId: 'org-1',
        projectId: 'project-1',
        photoId: 'photo-1',
        filename: 'Laura & Maxime 01.JPG',
      })
    ).toBe('organizations/org-1/projects/project-1/originals/photo-1-Laura-Maxime-01.JPG');
  });

  it('uploads originals, creates photo rows, and creates initial worker jobs', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null });
    const photoSingle = vi.fn().mockResolvedValue({
      data: { id: 'photo-generated-1' },
      error: null,
    });
    const photoSelect = vi.fn(() => ({ single: photoSingle }));
    const photoInsert = vi.fn(() => ({ select: photoSelect }));
    const jobsInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn((table: string) => {
      if (table === 'photos') return { insert: photoInsert };
      if (table === 'jobs') return { insert: jobsInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const client = {
      storage: {
        from: vi.fn(() => ({ upload })),
      },
      from,
    };

    const progress: number[] = [];
    const result = await uploadPhotosToCloud({
      activeProject: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Mariage Laura & Maxime',
      },
      files: [createFile('Laura & Maxime 01.JPG')],
      localPhotoIds: ['local-photo-1'],
      client,
      createPhotoId: () => 'photo-generated-1',
      onProgress: (value) => progress.push(value),
      now: () => new Date('2026-05-29T12:00:00.000Z'),
    });

    expect(result).toEqual({
      uploaded: 1,
      photoIds: ['photo-generated-1'],
      mappings: [{ localPhotoId: 'local-photo-1', cloudPhotoId: 'photo-generated-1' }],
    });
    expect(client.storage.from).toHaveBeenCalledWith('project-photos');
    expect(upload).toHaveBeenCalledWith(
      'organizations/org-1/projects/project-1/originals/photo-generated-1-Laura-Maxime-01.JPG',
      expect.any(File),
      { cacheControl: '3600', upsert: false }
    );
    expect(photoInsert).toHaveBeenCalledWith({
      id: 'photo-generated-1',
      project_id: 'project-1',
      original_filename: 'Laura & Maxime 01.JPG',
      file_size: 10,
      mime_type: 'image/jpeg',
      storage_path: 'organizations/org-1/projects/project-1/originals/photo-generated-1-Laura-Maxime-01.JPG',
      analysis_status: 'pending',
    });
    expect(jobsInsert).toHaveBeenCalledWith([
      {
        project_id: 'project-1',
        photo_id: 'photo-generated-1',
        job_type: 'generate_thumbnail',
        status: 'pending',
      },
      {
        project_id: 'project-1',
        photo_id: 'photo-generated-1',
        job_type: 'quality_analysis',
        status: 'pending',
      },
      {
        project_id: 'project-1',
        photo_id: 'photo-generated-1',
        job_type: 'perceptual_hash',
        status: 'pending',
      },
      {
        project_id: 'project-1',
        photo_id: 'photo-generated-1',
        job_type: 'semantic_embedding',
        status: 'pending',
        payload: {
          storage_path: 'organizations/org-1/projects/project-1/originals/photo-generated-1-Laura-Maxime-01.JPG',
        },
        run_after: '2026-05-29T12:00:05.000Z',
      },
    ]);
    expect(progress).toEqual([100]);
  });

  it('enqueues a face_detection job only when face analysis is opted in', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null });
    const photoSingle = vi.fn().mockResolvedValue({ data: { id: 'photo-1' }, error: null });
    const photoSelect = vi.fn(() => ({ single: photoSingle }));
    const photoInsert = vi.fn(() => ({ select: photoSelect }));
    const jobsInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      storage: { from: vi.fn(() => ({ upload })) },
      from: vi.fn((table: string) => {
        if (table === 'photos') return { insert: photoInsert };
        if (table === 'jobs') return { insert: jobsInsert };
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await uploadPhotosToCloud({
      activeProject: { id: 'project-1', organizationId: 'org-1', name: 'Mariage' },
      files: [createFile('photo.jpg')],
      client,
      createPhotoId: () => 'photo-1',
      now: () => new Date('2026-05-29T12:00:00.000Z'),
      faceAnalysisEnabled: true,
    });

    const insertedJobs = jobsInsert.mock.calls[0][0] as Array<{ job_type: string; run_after?: string }>;
    const faceJob = insertedJobs.find((job) => job.job_type === 'face_detection');
    expect(insertedJobs).toHaveLength(5);
    expect(faceJob).toMatchObject({
      job_type: 'face_detection',
      run_after: '2026-05-29T12:00:05.000Z',
    });
  });

  it('does not enqueue face_detection when opt-in is off (default)', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null });
    const photoSingle = vi.fn().mockResolvedValue({ data: { id: 'photo-1' }, error: null });
    const photoSelect = vi.fn(() => ({ single: photoSingle }));
    const photoInsert = vi.fn(() => ({ select: photoSelect }));
    const jobsInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      storage: { from: vi.fn(() => ({ upload })) },
      from: vi.fn((table: string) => {
        if (table === 'photos') return { insert: photoInsert };
        if (table === 'jobs') return { insert: jobsInsert };
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await uploadPhotosToCloud({
      activeProject: { id: 'project-1', organizationId: 'org-1', name: 'Mariage' },
      files: [createFile('photo.jpg')],
      client,
      createPhotoId: () => 'photo-1',
    });

    const insertedJobs = jobsInsert.mock.calls[0][0] as Array<{ job_type: string }>;
    expect(insertedJobs.some((job) => job.job_type === 'face_detection')).toBe(false);
  });
});
