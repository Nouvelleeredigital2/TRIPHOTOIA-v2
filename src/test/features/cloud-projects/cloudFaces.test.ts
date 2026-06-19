import { describe, expect, it, vi } from 'vitest';
import {
  clusterFacesIntoGroups,
  deletePersonFaces,
  fetchPhotosForConfirmedPerson,
  nameAnonymousGroup,
  setProjectFaceAnalysis,
  type FaceRecord,
} from '../../../features/cloud-projects/cloudFaces';

const face = (id: string, photoId: string, embedding: number[], personId: string | null = null): FaceRecord => ({
  id,
  photoId,
  personId,
  embedding,
});

describe('clusterFacesIntoGroups', () => {
  it('groups similar anonymous faces and separates dissimilar ones', () => {
    const faces = [
      face('f1', 'p1', [1, 0, 0]),
      face('f2', 'p2', [0.99, 0.01, 0]),
      face('f3', 'p3', [0, 1, 0]),
    ];
    const groups = clusterFacesIntoGroups(faces, 0.9);
    expect(groups).toHaveLength(2);
    expect(groups[0].size).toBe(2);
    expect(groups[0].faceIds).toEqual(['f1', 'f2']);
    expect(groups[0].photoIds).toEqual(['p1', 'p2']);
    expect(groups[1].faceIds).toEqual(['f3']);
  });

  it('excludes faces already assigned to a person (only anonymous groups)', () => {
    const faces = [
      face('f1', 'p1', [1, 0, 0], 'person-1'),
      face('f2', 'p2', [1, 0, 0]),
    ];
    const groups = clusterFacesIntoGroups(faces, 0.9);
    expect(groups).toHaveLength(1);
    expect(groups[0].faceIds).toEqual(['f2']);
  });
});

describe('setProjectFaceAnalysis (opt-in)', () => {
  it('updates the project opt-in flag', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ update })) };

    await setProjectFaceAnalysis({ projectId: 'project-1', enabled: true, client: client as never });

    expect(client.from).toHaveBeenCalledWith('projects');
    expect(update).toHaveBeenCalledWith({ face_analysis_enabled: true });
    expect(eq).toHaveBeenCalledWith('id', 'project-1');
  });
});

describe('nameAnonymousGroup (manual naming only)', () => {
  it('names a group atomically via the name_face_group RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'person-9', error: null });
    const client = { rpc, from: vi.fn() };

    const result = await nameAnonymousGroup({
      projectId: 'project-1',
      faceIds: ['f1', 'f2'],
      displayName: '  Laura  ',
      client: client as never,
    });

    expect(rpc).toHaveBeenCalledWith('name_face_group', {
      p_project_id: 'project-1',
      p_face_ids: ['f1', 'f2'],
      p_display_name: 'Laura',
    });
    expect(result).toEqual({ personId: 'person-9' });
  });

  it('refuses to name without an explicit name (never auto-names)', async () => {
    const rpc = vi.fn();
    const client = { rpc, from: vi.fn() };
    await expect(
      nameAnonymousGroup({ projectId: 'p1', faceIds: ['f1'], displayName: '   ', client: client as never }),
    ).rejects.toThrow(/obligatoire/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('deletePersonFaces (face data removal)', () => {
  it('deletes the faces then the person', async () => {
    const facesEq = vi.fn().mockResolvedValue({ error: null });
    const facesDelete = vi.fn(() => ({ eq: facesEq }));
    const peopleEq = vi.fn().mockResolvedValue({ error: null });
    const peopleDelete = vi.fn(() => ({ eq: peopleEq }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'photo_faces') return { delete: facesDelete };
        if (table === 'people') return { delete: peopleDelete };
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await deletePersonFaces({ personId: 'person-9', client: client as never });

    expect(facesEq).toHaveBeenCalledWith('person_id', 'person-9');
    expect(peopleEq).toHaveBeenCalledWith('id', 'person-9');
  });
});

describe('fetchPhotosForConfirmedPerson (filter by validated person)', () => {
  const buildClient = (status: string | null, facePhotoIds: string[]) => {
    const personMaybeSingle = vi.fn().mockResolvedValue({
      data: status ? { status } : null,
      error: null,
    });
    const personEq = vi.fn(() => ({ maybeSingle: personMaybeSingle }));
    const personSelect = vi.fn(() => ({ eq: personEq }));

    const facesEq = vi.fn().mockResolvedValue({
      data: facePhotoIds.map((photo_id) => ({ photo_id })),
      error: null,
    });
    const facesSelect = vi.fn(() => ({ eq: facesEq }));

    return {
      from: vi.fn((table: string) => {
        if (table === 'people') return { select: personSelect };
        if (table === 'photo_faces') return { select: facesSelect };
        throw new Error(`Unexpected table ${table}`);
      }),
    };
  };

  it('returns distinct photo ids for a confirmed person', async () => {
    const client = buildClient('confirmed', ['p1', 'p1', 'p2']);
    const photos = await fetchPhotosForConfirmedPerson({ personId: 'person-9', client: client as never });
    expect(photos).toEqual(['p1', 'p2']);
  });

  it('returns nothing for an unconfirmed person', async () => {
    const client = buildClient('unconfirmed', ['p1']);
    const photos = await fetchPhotosForConfirmedPerson({ personId: 'person-9', client: client as never });
    expect(photos).toEqual([]);
  });
});
