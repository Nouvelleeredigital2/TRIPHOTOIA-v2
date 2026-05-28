import { beforeEach, describe, expect, it } from 'vitest';
import { useCloudProjectStore } from '../../store/cloudProjectStore';

describe('cloudProjectStore', () => {
  beforeEach(() => {
    useCloudProjectStore.getState().clearActiveProject();
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
});
