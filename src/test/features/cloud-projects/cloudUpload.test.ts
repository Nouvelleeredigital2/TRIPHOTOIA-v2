import { describe, expect, it, vi } from 'vitest';
import {
  buildProjectPhotoStoragePath,
  uploadPhotosToCloud,
} from '../../../features/cloud-projects/cloudUpload';

function createFile(name: string) {
  return new File(['image-data'], name, { type: 'image/jpeg' });
}

// uploadPhotosToCloud now uses RPCs (register_cloud_photo, enqueue_face_detection_job)
// instead of direct INSERT on photos/jobs tables, because on new Supabase instances
// (ES256/JWKS), PostgREST does not switch to the 'authenticated' role from the JWT,
// so direct INSERTs are blocked by RLS regardless of policy conditions.

describe('cloud upload helpers', () => {
  it('builds a safe private storage path for project originals', () => {
    expect(
      buildProjectPhotoStoragePath({
        organizationId: 'org-1',
        projectId: 'project-1',
        photoId: 'photo-1',
        filename: 'Laura & Maxime 01.JPG',
      })
    ).toBe(
      'organizations/org-1/projects/project-1/originals/photo-1-Laura-Maxime-01.JPG'
    );
  });

  it('uploads the file to storage then calls register_cloud_photo RPC', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ photo_id: 'photo-generated-1' }],
      error: null,
    });

    const client = {
      storage: { from: vi.fn(() => ({ upload })) },
      rpc,
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
      client: client as never,
      createPhotoId: () => 'photo-generated-1',
      onProgress: (value) => progress.push(value),
      now: () => new Date('2026-05-29T12:00:00.000Z'),
    });

    expect(result).toEqual({
      uploaded: 1,
      photoIds: ['photo-generated-1'],
      mappings: [
        { localPhotoId: 'local-photo-1', cloudPhotoId: 'photo-generated-1' },
      ],
    });
    expect(client.storage.from).toHaveBeenCalledWith('project-photos');
    expect(upload).toHaveBeenCalledWith(
      'organizations/org-1/projects/project-1/originals/photo-generated-1-Laura-Maxime-01.JPG',
      expect.any(File),
      { cacheControl: '3600', upsert: false }
    );
    // register_cloud_photo RPC called with correct args
    expect(rpc).toHaveBeenCalledWith('register_cloud_photo', {
      p_project_id: 'project-1',
      p_photo_id: 'photo-generated-1',
      p_original_filename: 'Laura & Maxime 01.JPG',
      p_storage_path:
        'organizations/org-1/projects/project-1/originals/photo-generated-1-Laura-Maxime-01.JPG',
      p_file_size: 10,
      p_mime_type: 'image/jpeg',
      p_semantic_delay_ms: 5000,
    });
    expect(progress).toEqual([100]);
  });

  it('calls enqueue_face_detection_job only when face analysis is opted in', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = { storage: { from: vi.fn(() => ({ upload })) }, rpc };

    await uploadPhotosToCloud({
      activeProject: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Mariage',
      },
      files: [createFile('photo.jpg')],
      client: client as never,
      createPhotoId: () => 'photo-1',
      now: () => new Date('2026-05-29T12:00:00.000Z'),
      faceAnalysisEnabled: true,
    });

    const calls = rpc.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('register_cloud_photo');
    expect(calls).toContain('enqueue_face_detection_job');
    const faceCall = rpc.mock.calls.find(
      (c: unknown[]) => c[0] === 'enqueue_face_detection_job'
    );
    expect(faceCall?.[1]).toMatchObject({
      p_project_id: 'project-1',
      p_photo_id: 'photo-1',
    });
  });

  it('compense (supprime l’objet uploadé) si register_cloud_photo échoue (P1-D)', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    // L'upload réussit, mais l'enregistrement DB échoue.
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('db fail') });

    const client = {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      rpc,
    };

    await expect(
      uploadPhotosToCloud({
        activeProject: {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Mariage',
        },
        files: [createFile('photo.jpg')],
        client: client as never,
        createPhotoId: () => 'photo-1',
      })
    ).rejects.toThrow('db fail');

    // L'objet orphelin a été supprimé (compensation), au bon chemin.
    expect(remove).toHaveBeenCalledWith([
      'organizations/org-1/projects/project-1/originals/photo-1-photo.jpg',
    ]);
  });

  it('does not call enqueue_face_detection_job when opt-in is off (default)', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = { storage: { from: vi.fn(() => ({ upload })) }, rpc };

    await uploadPhotosToCloud({
      activeProject: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Mariage',
      },
      files: [createFile('photo.jpg')],
      client: client as never,
      createPhotoId: () => 'photo-1',
    });

    const calls = rpc.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).not.toContain('enqueue_face_detection_job');
    expect(calls).toContain('register_cloud_photo');
  });
});
