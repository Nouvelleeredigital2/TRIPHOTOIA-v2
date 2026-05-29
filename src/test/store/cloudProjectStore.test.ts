import { beforeEach, describe, expect, it } from 'vitest';
import { useCloudProjectStore } from '../../store/cloudProjectStore';

describe('cloudProjectStore', () => {
  beforeEach(() => {
    useCloudProjectStore.getState().clearActiveProject();
    useCloudProjectStore.getState().clearCloudPhotoLinks();
  });

  it('stores the active cloud project summary when a project is opened', () => {
    useCloudProjectStore.getState().setActiveProject({
      id: 'project-1',
      organizationId: 'org-1',
      name: 'Mariage Laura & Maxime',
    });

    expect(useCloudProjectStore.getState().activeProject).toEqual({
      id: 'project-1',
      organizationId: 'org-1',
      name: 'Mariage Laura & Maxime',
    });
  });

  it('clears the active cloud project without touching local photo state', () => {
    useCloudProjectStore.getState().setActiveProject({
      id: 'project-1',
      organizationId: 'org-1',
      name: 'Mariage Laura & Maxime',
    });

    useCloudProjectStore.getState().clearActiveProject();

    expect(useCloudProjectStore.getState().activeProject).toBeNull();
  });

  it('stores cloud photo ids by local photo id for later cloud decisions', () => {
    useCloudProjectStore.getState().linkCloudPhotos([
      { localPhotoId: 'local-photo-1', cloudPhotoId: 'cloud-photo-1' },
      { localPhotoId: 'local-photo-2', cloudPhotoId: 'cloud-photo-2' },
    ]);

    expect(useCloudProjectStore.getState().getCloudPhotoId('local-photo-1')).toBe('cloud-photo-1');
    expect(useCloudProjectStore.getState().getCloudPhotoId('missing-photo')).toBeUndefined();
  });

  it('clears cloud photo links when the cloud project is closed', () => {
    useCloudProjectStore.getState().linkCloudPhotos([
      { localPhotoId: 'local-photo-1', cloudPhotoId: 'cloud-photo-1' },
    ]);

    useCloudProjectStore.getState().clearActiveProject();

    expect(useCloudProjectStore.getState().cloudPhotoIdsByLocalId).toEqual({});
  });

  it('clears stale cloud photo links when switching to another cloud project', () => {
    useCloudProjectStore.getState().setActiveProject({
      id: 'project-1',
      organizationId: 'org-1',
      name: 'Projet 1',
    });
    useCloudProjectStore.getState().linkCloudPhotos([
      { localPhotoId: 'local-photo-1', cloudPhotoId: 'cloud-photo-1' },
    ]);

    useCloudProjectStore.getState().setActiveProject({
      id: 'project-2',
      organizationId: 'org-1',
      name: 'Projet 2',
    });

    expect(useCloudProjectStore.getState().cloudPhotoIdsByLocalId).toEqual({});
  });
});
