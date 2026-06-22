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
      partial: 0,
      failed: 0,
      photoIds: ['photo-generated-1'],
      mappings: [
        { localPhotoId: 'local-photo-1', cloudPhotoId: 'photo-generated-1' },
      ],
      results: [
        {
          localPhotoId: 'local-photo-1',
          cloudPhotoId: 'photo-generated-1',
          status: 'success',
        },
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

  it('passe p_content_hash à register_cloud_photo quand un hash de contenu est fourni (P1-9 serveur)', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { storage: { from: vi.fn(() => ({ upload })) }, rpc };

    await uploadPhotosToCloud({
      activeProject: { id: 'project-1', organizationId: 'org-1', name: 'M' },
      files: [createFile('a.jpg')],
      contentHashes: ['sha256-abc'],
      client: client as never,
      createPhotoId: () => 'photo-1',
    });

    const registerCall = rpc.mock.calls.find(
      (c: unknown[]) => c[0] === 'register_cloud_photo'
    );
    expect(registerCall?.[1]).toMatchObject({ p_content_hash: 'sha256-abc' });
  });

  it('n’envoie PAS p_content_hash sans hash fourni (compat RPC legacy 7-args)', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { storage: { from: vi.fn(() => ({ upload })) }, rpc };

    await uploadPhotosToCloud({
      activeProject: { id: 'project-1', organizationId: 'org-1', name: 'M' },
      files: [createFile('a.jpg')],
      client: client as never,
      createPhotoId: () => 'photo-1',
    });

    const registerCall = rpc.mock.calls.find(
      (c: unknown[]) => c[0] === 'register_cloud_photo'
    );
    expect(registerCall?.[1]).not.toHaveProperty('p_content_hash');
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

  it('compense (supprime l’objet uploadé) et marque la photo échouée si register_cloud_photo échoue (P1-D + P1-9)', async () => {
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

    // P1-9 : ne lève plus — retourne un statut structuré `failed`.
    const result = await uploadPhotosToCloud({
      activeProject: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Mariage',
      },
      files: [createFile('photo.jpg')],
      localPhotoIds: ['local-1'],
      client: client as never,
      createPhotoId: () => 'photo-1',
    });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.photoIds).toEqual([]);
    expect(result.results[0]).toMatchObject({
      localPhotoId: 'local-1',
      status: 'failed',
      error: 'db fail',
    });

    // L'objet orphelin a été supprimé (compensation), au bon chemin.
    expect(remove).toHaveBeenCalledWith([
      'organizations/org-1/projects/project-1/originals/photo-1-photo.jpg',
    ]);
  });

  it('marque la photo `partial` (et ne lève pas) si le job visage échoue après enregistrement (P1-9)', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'ok' }, error: null });
    // register OK, mais enqueue_face_detection_job échoue.
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'enqueue_face_detection_job'
          ? { data: null, error: new Error('queue down') }
          : { data: null, error: null }
      )
    );

    const client = { storage: { from: vi.fn(() => ({ upload })) }, rpc };

    const result = await uploadPhotosToCloud({
      activeProject: { id: 'project-1', organizationId: 'org-1', name: 'M' },
      files: [createFile('photo.jpg')],
      client: client as never,
      createPhotoId: () => 'photo-1',
      faceAnalysisEnabled: true,
    });

    // La photo est bien créée malgré l'échec du job secondaire.
    expect(result.uploaded).toBe(1);
    expect(result.partial).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.photoIds).toEqual(['photo-1']);
    expect(result.results[0]).toMatchObject({
      cloudPhotoId: 'photo-1',
      status: 'partial',
    });
    expect(result.results[0].error).toContain('queue down');
  });

  it('isole les échecs : une photo échoue, l’autre réussit (P1-9)', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('storage 500') })
      .mockResolvedValueOnce({ data: { path: 'ok' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      rpc,
    };

    let photoSeq = 0;
    const result = await uploadPhotosToCloud({
      activeProject: { id: 'project-1', organizationId: 'org-1', name: 'M' },
      files: [createFile('a.jpg'), createFile('b.jpg')],
      localPhotoIds: ['local-a', 'local-b'],
      client: client as never,
      createPhotoId: () => `photo-${++photoSeq}`,
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.map((r) => r.status)).toEqual(['failed', 'success']);
    // register_cloud_photo n'est appelé que pour la photo dont l'upload a réussi.
    expect(
      rpc.mock.calls.filter((c: unknown[]) => c[0] === 'register_cloud_photo')
    ).toHaveLength(1);
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
