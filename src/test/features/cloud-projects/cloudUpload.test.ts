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
      client,
      createPhotoId: () => 'photo-generated-1',
      onProgress: (value) => progress.push(value),
    });

    expect(result).toEqual({
      uploaded: 1,
      photoIds: ['photo-generated-1'],
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
    ]);
    expect(progress).toEqual([100]);
  });
});
