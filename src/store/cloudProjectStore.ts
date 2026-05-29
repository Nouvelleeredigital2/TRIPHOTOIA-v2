import { create } from 'zustand';

export interface ActiveCloudProject {
  id: string;
  organizationId: string;
  name: string;
}

export interface CloudPhotoLink {
  localPhotoId: string;
  cloudPhotoId: string;
}

interface CloudProjectState {
  activeProject: ActiveCloudProject | null;
  cloudPhotoIdsByLocalId: Record<string, string>;
  setActiveProject: (project: ActiveCloudProject) => void;
  clearActiveProject: () => void;
  linkCloudPhotos: (links: CloudPhotoLink[]) => void;
  getCloudPhotoId: (localPhotoId: string) => string | undefined;
  clearCloudPhotoLinks: () => void;
}

export const useCloudProjectStore = create<CloudProjectState>((set, get) => ({
  activeProject: null,
  cloudPhotoIdsByLocalId: {},
  setActiveProject: (project) =>
    set((state) => ({
      activeProject: project,
      cloudPhotoIdsByLocalId:
        state.activeProject?.id === project.id ? state.cloudPhotoIdsByLocalId : {},
    })),
  clearActiveProject: () => set({ activeProject: null, cloudPhotoIdsByLocalId: {} }),
  linkCloudPhotos: (links) =>
    set((state) => ({
      cloudPhotoIdsByLocalId: links.reduce(
        (next, link) => ({
          ...next,
          [link.localPhotoId]: link.cloudPhotoId,
        }),
        state.cloudPhotoIdsByLocalId
      ),
    })),
  getCloudPhotoId: (localPhotoId) => get().cloudPhotoIdsByLocalId[localPhotoId],
  clearCloudPhotoLinks: () => set({ cloudPhotoIdsByLocalId: {} }),
}));
